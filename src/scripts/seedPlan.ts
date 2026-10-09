import { Types } from 'mongoose';
import type { CardStatus, Rating } from '../types/domain';
import { addUtcDays, endOfUtcDay, startOfUtcDay } from '../utils/dates';
import { schedule } from '../utils/schedule';
import { summarize } from '../utils/sessionSummary';

// Pure: no database access. The seed script writes the plan; tests check its invariants.
// Every review is produced by replaying `schedule()` in simulated time, so card state, review
// history, sessions and stats agree with each other and with the API's rules.

export const SEED_RNG_SEED = 42;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Days of simulated history, ending today. */
const DAYS_OF_HISTORY = 90;
/** Study on today and the 8 days before: a streak that ends today. */
const STREAK_DAYS = 9;
/** Extra random study days earlier in the history (one session each). */
const EXTRA_STUDY_DAYS = 12;
/** The last cards of each active deck are never introduced, so some cards stay new. */
const RESERVED_NEW_PER_DECK = 2;
/** Days (offsets back from today) on which the archived deck is studied. */
const ARCHIVED_STUDY_OFFSETS = [70, 60, 50];
/** Most reviews one session can hold (a deck has about a dozen cards, so this rarely binds). */
const SESSION_CAP = 30;

interface SubjectDef {
  name: string;
  color: string;
  icon: string;
}

interface DeckDef {
  title: string;
  subject: string;
  description: string;
  color: string;
  dailyNewLimit: number;
  archived: boolean;
  tag: string;
  cards: [front: string, back: string][];
}

const SUBJECT_DEFS: SubjectDef[] = [
  { name: 'Biology', color: '#22c55e', icon: '🧬' },
  { name: 'Chemistry', color: '#f59e0b', icon: '⚗️' },
  { name: 'Spanish', color: '#ef4444', icon: '🇪🇸' },
  { name: 'History', color: '#8b5cf6', icon: '📜' },
];

const DECK_DEFS: DeckDef[] = [
  {
    title: 'Cell structure',
    subject: 'Biology',
    description: 'Organelles and the cell membrane',
    color: '#0ea5e9',
    dailyNewLimit: 10,
    archived: false,
    tag: 'biology',
    cards: [
      ['Powerhouse of the cell', 'Mitochondrion'],
      ['Site of protein synthesis', 'Ribosome'],
      ['Controls what enters and leaves the cell', 'Cell membrane'],
      ['Genetic material in eukaryotes, stored in the control centre', 'DNA in the nucleus'],
      ['Organelle that packages and ships proteins', 'Golgi apparatus'],
      ['Site of photosynthesis in plant cells', 'Chloroplast'],
      ['Rigid outer layer of plant cells', 'Cell wall'],
      ['Organelle that makes lipids and detoxifies', 'Smooth endoplasmic reticulum'],
      ['Control centre of the cell', 'Nucleus'],
      ['Organelles that break down waste', 'Lysosomes'],
      ['Fluid that fills the cell around the organelles', 'Cytoplasm'],
      ['Basic structure of the cell membrane', 'Phospholipid bilayer'],
      ['Movement of water across a membrane', 'Osmosis'],
    ],
  },
  {
    title: 'Genetics basics',
    subject: 'Biology',
    description: 'Alleles, genotypes and DNA',
    color: '#14b8a6',
    dailyNewLimit: 8,
    archived: false,
    tag: 'biology',
    cards: [
      ['Alternative forms of a gene', 'Alleles'],
      ['Genotype with two identical alleles', 'Homozygous'],
      ['Genotype with two different alleles', 'Heterozygous'],
      ['Observable trait', 'Phenotype'],
      ['Units of heredity located on chromosomes', 'Genes'],
      ['The four bases in DNA', 'Adenine, thymine, guanine, cytosine'],
      ['In DNA, adenine pairs with', 'Thymine'],
      ['Monk who studied inheritance in peas', 'Gregor Mendel'],
      ['Chromosome number in human body cells', '46 (23 pairs)'],
      ['Cell division that makes gametes', 'Meiosis'],
      ['A change in the DNA sequence', 'Mutation'],
      ['Process that copies DNA into RNA', 'Transcription'],
    ],
  },
  {
    title: 'Atomic structure',
    subject: 'Chemistry',
    description: 'Protons, neutrons, electrons and bonds',
    color: '#f97316',
    dailyNewLimit: 8,
    archived: false,
    tag: 'chemistry',
    cards: [
      ['Positively charged particles in the nucleus', 'Protons'],
      ['Neutral particles in the nucleus', 'Neutrons'],
      ['The number of protons defines the', 'Element (atomic number)'],
      ['Charge of an electron', 'Negative (-1)'],
      ['Maximum electrons in the first shell', '2'],
      ['Element with the symbol Fe', 'Iron'],
      ['Isotopes of an element have the same protons but different', 'Neutrons'],
      ['Group 18 elements are called', 'Noble gases'],
      ['Most of an atom\'s mass is in its', 'Nucleus'],
      ['An ion with more electrons than protons', 'Anion'],
      ['Valence electrons in group 1', 'One'],
      ['A bond formed by sharing electrons', 'Covalent bond'],
    ],
  },
  {
    title: 'Common verbs',
    subject: 'Spanish',
    description: 'Irregular verbs for everyday use',
    color: '#ec4899',
    dailyNewLimit: 10,
    archived: false,
    tag: 'spanish',
    cards: [
      ['to be (permanent)', 'ser'],
      ['to have', 'tener'],
      ['to go', 'ir'],
      ['to speak', 'hablar'],
      ['to eat', 'comer'],
      ['to live', 'vivir'],
      ['to want', 'querer'],
      ['to do / to make', 'hacer'],
      ['to see', 'ver'],
      ['to know (facts)', 'saber'],
      ['to give', 'dar'],
      ['to come', 'venir'],
    ],
  },
  {
    title: 'World War II',
    subject: 'History',
    description: 'Key dates and events (archived exam prep)',
    color: '#64748b',
    dailyNewLimit: 5,
    archived: true,
    tag: 'history',
    cards: [
      ['Year WWII began in Europe', '1939'],
      ['Year WWII ended', '1945'],
      ['1939 non-aggression pact between Germany and the USSR', 'Molotov-Ribbentrop Pact'],
      ['Code name of the Allied landings in Normandy', 'Operation Overlord'],
      ['Battle that turned the tide on the Eastern Front', 'Stalingrad'],
      ['Japanese attack that brought the US into the war', 'Pearl Harbor'],
      ['Leader of Italy\'s fascist government', 'Benito Mussolini'],
      ['German submarines that hunted Allied shipping', 'U-boats'],
      ['Cities hit by atomic bombs in 1945', 'Hiroshima and Nagasaki'],
      ['1945 conference that decided postwar Germany', 'Potsdam Conference'],
    ],
  },
];

export interface SubjectDoc {
  _id: Types.ObjectId;
  name: string;
  color: string;
  icon: string;
}

export interface DeckDoc {
  _id: Types.ObjectId;
  title: string;
  subject: Types.ObjectId;
  description: string;
  color: string;
  dailyNewLimit: number;
  archived: boolean;
}

export interface CardDoc {
  _id: Types.ObjectId;
  deck: Types.ObjectId;
  front: string;
  back: string;
  tags: string[];
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: Date;
  lastReviewedAt: Date | null;
  status: CardStatus;
  suspended: boolean;
}

export interface ReviewDoc {
  _id: Types.ObjectId;
  card: Types.ObjectId;
  deck: Types.ObjectId;
  session: Types.ObjectId;
  rating: Rating;
  previousStatus: CardStatus;
  newStatus: CardStatus;
  previousInterval: number;
  newInterval: number;
  easeFactorAfter: number;
  timeSpentMs: number;
  reviewedAt: Date;
}

export interface SessionDoc {
  _id: Types.ObjectId;
  deck: Types.ObjectId;
  status: 'completed';
  startedAt: Date;
  endedAt: Date;
  cardsReviewed: number;
  correctCount: number;
  accuracy: number;
  totalTimeMs: number;
}

export interface SeedPlan {
  subjects: SubjectDoc[];
  decks: DeckDoc[];
  cards: CardDoc[];
  reviews: ReviewDoc[];
  sessions: SessionDoc[];
}

/** Seeded PRNG (mulberry32): the same seed always gives the same plan for the same day. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A card's ability shifts the rating mix: strong cards get more `good`/`easy`, weak ones more `again`. */
function pickRating(ability: number, roll: number): Rating {
  const weights: [Rating, number][] = [
    ['again', 0.05 + 0.2 * (1 - ability)],
    ['hard', 0.12],
    ['good', 0.5],
    ['easy', 0.13 + 0.15 * ability],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = roll * total;
  for (const [rating, weight] of weights) {
    if (threshold < weight) return rating;
    threshold -= weight;
  }
  return 'good';
}

/** Takes `count` distinct items from `items`, chosen with `rng`. */
function pickDistinct<T>(items: T[], count: number, rng: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const [item] = pool.splice(Math.floor(rng() * pool.length), 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}

/**
 * Builds the demo data for the day `now` falls on. Study days are chosen first, then each session
 * reviews one deck's due cards (plus new cards up to the deck's daily limit) in simulated time.
 * Cards in decks that were not studied on the days they came due stay due or overdue. The last
 * cards of each active deck are never introduced, so they stay new. Two reviewed cards and one new
 * card are suspended at the end, and the archived deck is studied only on its own days, so it has
 * history but no due cards. Because the simulation runs relative to today, the structure is the same
 * for every day; only the timestamps move.
 */
export function buildSeedPlan(now: Date, seed: number = SEED_RNG_SEED): SeedPlan {
  const rng = createRng(seed);
  const today = startOfUtcDay(now);
  const historyStart = addUtcDays(today, -(DAYS_OF_HISTORY - 1));

  const subjects: SubjectDoc[] = SUBJECT_DEFS.map((def) => ({
    _id: new Types.ObjectId(),
    name: def.name,
    color: def.color,
    icon: def.icon,
  }));
  const subjectId = new Map(subjects.map((subject) => [subject.name, subject._id]));

  const decks: DeckDoc[] = [];
  const cards: CardDoc[] = [];
  const cardsOfDeck = new Map<string, CardDoc[]>();
  const abilityOfCard = new Map<string, number>();

  for (const def of DECK_DEFS) {
    const subject = subjectId.get(def.subject);
    if (!subject) throw new Error(`Seed data: unknown subject "${def.subject}"`);
    const deck: DeckDoc = {
      _id: new Types.ObjectId(),
      title: def.title,
      subject,
      description: def.description,
      color: def.color,
      dailyNewLimit: def.dailyNewLimit,
      archived: def.archived,
    };
    decks.push(deck);

    const deckCards = def.cards.map(([front, back]): CardDoc => {
      const card: CardDoc = {
        _id: new Types.ObjectId(),
        deck: deck._id,
        front,
        back,
        tags: [def.tag],
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        // A new card is due from the first day of the history, so it is reviewable from then on.
        dueDate: historyStart,
        lastReviewedAt: null,
        status: 'new',
        suspended: false,
      };
      abilityOfCard.set(card._id.toString(), rng());
      return card;
    });
    cards.push(...deckCards);
    cardsOfDeck.set(deck._id.toString(), deckCards);
  }

  const archivedDeck = decks.find((deck) => deck.archived);
  const activeDecks = decks.filter((deck) => !deck.archived);
  if (!archivedDeck) throw new Error('Seed data: no archived deck defined');

  // Study days: today and the 8 before (a streak ending today), plus a few earlier random days.
  const archivedOffsets = new Set(ARCHIVED_STUDY_OFFSETS);
  const extraOffsets = new Set<number>();
  while (extraOffsets.size < EXTRA_STUDY_DAYS) {
    const offset = STREAK_DAYS + Math.floor(rng() * (DAYS_OF_HISTORY - STREAK_DAYS));
    if (!archivedOffsets.has(offset)) extraOffsets.add(offset);
  }
  const studyOffsets = [
    ...Array.from({ length: STREAK_DAYS }, (_, offset) => offset),
    ...extraOffsets,
    ...ARCHIVED_STUDY_OFFSETS,
  ];

  const reviews: ReviewDoc[] = [];
  const sessions: SessionDoc[] = [];
  const reservedIds = new Set(
    activeDecks.flatMap((deck) =>
      (cardsOfDeck.get(deck._id.toString()) ?? []).slice(-RESERVED_NEW_PER_DECK).map((card) => card._id.toString()),
    ),
  );

  /** Cards a session on `deck` can review by the end of `dayEnd`: due cards first, then new cards. */
  function queueFor(deck: DeckDoc, dayEnd: Date): CardDoc[] {
    const own = cardsOfDeck.get(deck._id.toString()) ?? [];
    const due = own
      .filter((card) => card.status !== 'new' && !card.suspended && card.dueDate <= dayEnd)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    const fresh = own
      .filter((card) => card.status === 'new' && !card.suspended && !reservedIds.has(card._id.toString()))
      .slice(0, deck.dailyNewLimit);
    return [...due, ...fresh];
  }

  for (const offset of studyOffsets.sort((a, b) => b - a)) {
    const simDay = addUtcDays(today, -offset);
    const dayEnd = endOfUtcDay(simDay);
    const isToday = offset === 0;

    // The archived deck is studied only on its own days; other days pick the deck with most to do.
    const candidates = archivedOffsets.has(offset) ? [archivedDeck] : activeDecks;
    let chosen: { deck: DeckDoc; queue: CardDoc[] } | undefined;
    for (const deck of candidates) {
      const queue = queueFor(deck, dayEnd);
      if (queue.length > (chosen?.queue.length ?? 0)) chosen = { deck, queue };
    }
    if (!chosen || chosen.queue.length === 0) continue;

    const sessionId = new Types.ObjectId();
    let clock = isToday
      ? now.getTime() - 2 * HOUR_MS
      : simDay.getTime() + (9 * 60 + Math.floor(rng() * 600)) * MINUTE_MS;

    const sessionReviews: ReviewDoc[] = [];
    for (const card of chosen.queue.slice(0, SESSION_CAP)) {
      const reviewedAt = new Date(clock);
      clock += 35 * 1000 + Math.floor(rng() * 25 * 1000);

      const rating = pickRating(abilityOfCard.get(card._id.toString()) ?? 0.5, rng());
      const previousStatus = card.status;
      const previousInterval = card.intervalDays;
      const next = schedule(card, rating, reviewedAt);

      card.easeFactor = next.easeFactor;
      card.intervalDays = next.intervalDays;
      card.repetitions = next.repetitions;
      card.lapses = next.lapses;
      card.dueDate = next.dueDate;
      card.status = next.status;
      card.lastReviewedAt = reviewedAt;

      sessionReviews.push({
        _id: new Types.ObjectId(),
        card: card._id,
        deck: card.deck,
        session: sessionId,
        rating,
        previousStatus,
        newStatus: next.status,
        previousInterval,
        newInterval: next.intervalDays,
        easeFactorAfter: next.easeFactor,
        timeSpentMs: 3000 + Math.floor(rng() * 12000),
        reviewedAt,
      });
    }
    if (sessionReviews.length === 0) continue;

    const summary = summarize({
      cardsReviewed: sessionReviews.length,
      correctCount: sessionReviews.filter((review) => review.rating !== 'again').length,
      totalTimeMs: sessionReviews.reduce((sum, review) => sum + review.timeSpentMs, 0),
    });
    const first = sessionReviews[0];
    const last = sessionReviews[sessionReviews.length - 1];
    if (!first || !last) continue;

    sessions.push({
      _id: sessionId,
      deck: chosen.deck._id,
      status: 'completed',
      startedAt: first.reviewedAt,
      endedAt: last.reviewedAt,
      cardsReviewed: summary.cardsReviewed,
      correctCount: summary.correctCount,
      accuracy: summary.accuracy,
      totalTimeMs: summary.totalTimeMs,
    });
    reviews.push(...sessionReviews);
  }

  // Suspend two reviewed cards and one new card from the active decks, then archive the deck.
  const activeIds = new Set(activeDecks.map((deck) => deck._id.toString()));
  const activeCards = cards.filter((card) => activeIds.has(card.deck.toString()));
  for (const card of pickDistinct(
    activeCards.filter((card) => card.lastReviewedAt !== null),
    2,
    rng,
  )) {
    card.suspended = true;
  }
  for (const card of pickDistinct(
    activeCards.filter((card) => card.status === 'new' && !card.suspended),
    1,
    rng,
  )) {
    card.suspended = true;
  }

  return { subjects, decks, cards, reviews, sessions };
}
