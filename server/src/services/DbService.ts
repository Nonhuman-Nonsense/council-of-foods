import type { StoredMeeting, StoredAudio, Counter, StoredRoomPower, StoredRoomPowerHour, StoredUsageEvent, OutboxLetter, BlockedRecipient, LetterReply, StoredClientLogBatch, StoredNetworkSample } from "@models/DBModels.js";
import { MongoClient, Db, Collection, InsertOneResult, type Document } from "mongodb";
import { Logger } from "@utils/Logger.js";
import { config } from "../config.js";

const AUTOPLAY_INDEX_SPEC = { meetingComplete: 1, language: 1, date: 1 } as const;
const AUTOPLAY_INDEX_NAME = "autoplay_meetingComplete_language_date";
const OLD_AUTOPLAY_INDEX_NAME = "autoplay_meetingComplete_date_language";

const LIVEKEY_INDEX_SPEC = { liveKey: 1 } as const;
const LIVEKEY_INDEX_NAME = "liveKey_unique";

const CLIENT_LOG_COLLECTION = "client_log";
/** The stored browser log rolls over at this size: MongoDB drops the oldest batches itself. */
export const CLIENT_LOG_CAP_BYTES = 512 * 1024 * 1024;

const NETWORK_SAMPLES_COLLECTION = "network_samples";
/** About 150,000 samples: months of one venue's minutes. */
export const NETWORK_SAMPLES_CAP_BYTES = 64 * 1024 * 1024;

let db: Db;
let mongoClient: MongoClient | null = null;
let activeConnectionKey: string | null = null;
export let meetingsCollection: Collection<StoredMeeting>;
export let audioCollection: Collection<StoredAudio>;
export let counters: Collection<Counter>;
export let usageEventsCollection: Collection<StoredUsageEvent> | undefined;
export let roomPowerCollection: Collection<StoredRoomPower> | undefined;
export let roomPowerHoursCollection: Collection<StoredRoomPowerHour> | undefined;
/** Letters on their way out, one per meeting (logic/letters/outbox.ts). */
export let lettersCollection: Collection<OutboxLetter>;
/** Recipients who may not be written to again. */
export let letterBlocklistCollection: Collection<BlockedRecipient>;
/** What came back to the letters (logic/letters/replies.ts). */
export let letterRepliesCollection: Collection<LetterReply>;
/** Browsers' console logs, sent from #staff-enabled pages (api/clientLogRoutes.ts). */
export let clientLogCollection: Collection<StoredClientLogBatch> | undefined;
/** Installations' network, sampled by their bridges (api/networkSamples.ts). */
export let networkSamplesCollection: Collection<StoredNetworkSample> | undefined;

/**
 * `readOnly` skips the setup below (counters, indexes, capped collections), which writes: for
 * the read scripts, which may run as a read-only user against production (`npm run prod`).
 */
export const initDb = async (
  dbUrl?: string, dbPrefix?: string, { readOnly = false }: { readOnly?: boolean } = {}
): Promise<void> => {
  // Config is already validated by the time we import this, but allow overrides for testing
  const url = dbUrl || config.COUNCIL_DB_URL;
  const prefix = dbPrefix || config.COUNCIL_DB_PREFIX;
  const connectionKey = `${url}::${prefix}`;

  if (mongoClient && activeConnectionKey === connectionKey) {
    return;
  }

  if (mongoClient) {
    await mongoClient.close();
  }

  Logger.info(`init`, `COUNCIL_DB_PREFIX is ${prefix}`);
  Logger.info("init", "Initializing Database...");
  mongoClient = new MongoClient(url);
  await mongoClient.connect();

  db = mongoClient.db(prefix);
  meetingsCollection = db.collection<StoredMeeting>("meetings");
  audioCollection = db.collection<StoredAudio>("audio");
  counters = db.collection<Counter>("counters");
  const usageEvents = db.collection<StoredUsageEvent>("usage_events");
  usageEventsCollection = usageEvents;
  roomPowerCollection = db.collection<StoredRoomPower>("room_power");
  const roomPowerHours = db.collection<StoredRoomPowerHour>("room_power_hours");
  roomPowerHoursCollection = roomPowerHours;
  lettersCollection = db.collection<OutboxLetter>("letters");
  letterBlocklistCollection = db.collection<BlockedRecipient>("letter_blocklist");
  letterRepliesCollection = db.collection<LetterReply>("letter_replies");
  activeConnectionKey = connectionKey;

  if (readOnly) {
    clientLogCollection = db.collection<StoredClientLogBatch>(CLIENT_LOG_COLLECTION);
    networkSamplesCollection = db.collection<StoredNetworkSample>(NETWORK_SAMPLES_COLLECTION);
    Logger.info("init", "Database ready (read-only).");
    return;
  }

  await initializeCounters();
  await ensureMeetingIndexes();
  await ensureUsageIndexes(usageEvents);
  await roomPowerHours.createIndex({ venueId: 1, hour: 1 }, { name: "room_power_hours_venueId_hour" });
  await lettersCollection.createIndex({ status: 1, queuedAt: 1 }, { name: "letters_status_queuedAt" });
  await lettersCollection.createIndex({ recipientId: 1, status: 1 }, { name: "letters_recipientId_status" });
  await letterRepliesCollection.createIndex({ kind: 1, printedAt: 1 }, { name: "letter_replies_kind_printedAt" });
  clientLogCollection = await ensureClientLogCollection(db);
  networkSamplesCollection = await ensureCappedCollection<StoredNetworkSample>(db, NETWORK_SAMPLES_COLLECTION, NETWORK_SAMPLES_CAP_BYTES);
  await networkSamplesCollection.createIndex({ venueId: 1, t: 1 }, { name: "network_samples_venueId_t" });
  Logger.info("init", "Database ready.");
};

function indexKeyMatches(
  key: Record<string, unknown> | undefined, spec: Record<string, unknown>
): boolean {
  if (!key) {
    return false;
  }
  const keyEntries = Object.entries(key);
  const specEntries = Object.entries(spec);
  if (keyEntries.length !== specEntries.length) {
    return false;
  }
  return keyEntries.every(([field, order], i) => {
    const [specField, specOrder] = specEntries[i];
    return field === specField && order === specOrder;
  });
}

const ensureMeetingIndexes = async (): Promise<void> => {
  // createIndex is idempotent; also creates the collection if missing (fresh DB / tests).
  const existing = await meetingsCollection.listIndexes().toArray().catch(() => []);

  // Drop the old key order if it's still around under its old name, so the new
  // (differently-ordered) index can be created under its own name without a conflict.
  const staleAutoplay = existing.find((idx) => idx.name === OLD_AUTOPLAY_INDEX_NAME);
  if (staleAutoplay && !indexKeyMatches(staleAutoplay.key as Record<string, unknown>, AUTOPLAY_INDEX_SPEC)) {
    await meetingsCollection.dropIndex(OLD_AUTOPLAY_INDEX_NAME);
    Logger.info("init", `Dropped stale meetings autoplay index (${OLD_AUTOPLAY_INDEX_NAME})`);
  }

  const hasAutoplayIndex = existing.some(
    (idx) => idx.name !== OLD_AUTOPLAY_INDEX_NAME
      && indexKeyMatches(idx.key as Record<string, unknown>, AUTOPLAY_INDEX_SPEC)
  );
  if (hasAutoplayIndex) {
    Logger.info("init", `Meetings autoplay index already present (${AUTOPLAY_INDEX_NAME})`);
  } else {
    await meetingsCollection.createIndex(AUTOPLAY_INDEX_SPEC, { name: AUTOPLAY_INDEX_NAME });
    Logger.info("init", `Created meetings autoplay index (${AUTOPLAY_INDEX_NAME})`);
  }

  const hasLiveKeyIndex = existing.some(
    (idx) => indexKeyMatches(idx.key as Record<string, unknown>, LIVEKEY_INDEX_SPEC)
  );
  if (hasLiveKeyIndex) {
    Logger.info("init", `Meetings liveKey index already present (${LIVEKEY_INDEX_NAME})`);
  } else {
    await meetingsCollection.createIndex(
      LIVEKEY_INDEX_SPEC, { name: LIVEKEY_INDEX_NAME, unique: true }
    );
    Logger.info("init", `Created meetings liveKey index (${LIVEKEY_INDEX_NAME})`);
  }
};

const ensureUsageIndexes = async (events: Collection<StoredUsageEvent>): Promise<void> => {
  // createIndex is idempotent. Totals are keyed by _id, so only the event log needs indexes.
  await events.createIndex({ ts: 1 }, { name: "usage_ts" });
  await events.createIndex({ meetingId: 1 }, { name: "usage_meetingId", sparse: true });
  await events.createIndex(
    { venueId: 1, ts: 1 }, { name: "usage_venueId_ts", sparse: true }
  );
};

/**
 * Logs that installations keep sending are capped, so they can be left on for weeks without
 * anyone pruning them. Created capped when missing; an existing uncapped one is left alone
 * (converting would rewrite it) and only warned about.
 */
const ensureCappedCollection = async <T extends Document>(
  database: Db, name: string, sizeBytes: number
): Promise<Collection<T>> => {
  const [existing] = await database.listCollections({ name }).toArray();
  if (!existing) {
    await database.createCollection(name, { capped: true, size: sizeBytes });
    Logger.info("init", `Created capped ${name} collection (${sizeBytes / 1024 / 1024} MB)`);
  } else if (!(existing as { options?: { capped?: boolean } }).options?.capped) {
    await Logger.warn("init", `${name} exists but is not capped: it will grow without limit`);
  }
  return database.collection<T>(name);
};

const ensureClientLogCollection = async (database: Db): Promise<Collection<StoredClientLogBatch>> => {
  const collection = await ensureCappedCollection<StoredClientLogBatch>(database, CLIENT_LOG_COLLECTION, CLIENT_LOG_CAP_BYTES);
  await collection.createIndex({ venueId: 1, receivedAt: -1 }, { name: "client_log_venueId_receivedAt" });
  await collection.createIndex({ setupIds: 1 }, { name: "client_log_setupIds" });
  await collection.createIndex({ meetingIds: 1 }, { name: "client_log_meetingIds" });
  await collection.createIndex({ pageId: 1, seq: 1 }, { name: "client_log_pageId_seq" });
  return collection;
};

export const closeDb = async (): Promise<void> => {
  if (!mongoClient) {
    return;
  }

  await mongoClient.close();
  mongoClient = null;
  activeConnectionKey = null;
  usageEventsCollection = undefined;
  roomPowerCollection = undefined;
  roomPowerHoursCollection = undefined;
};

const initializeCounters = async (): Promise<void> => {
  try {
    await counters.insertOne({ _id: "meeting_id", seq: 0 });
    Logger.info("init", "No meeting ID found, created initial meeting #0");
  } catch (e: unknown) {
    const error = e as { errorResponse?: { code: number } };
    if (error.errorResponse?.code === 11000) {
      Logger.info(
        "init", "Meeting ID counter already found in database. Not creating meeting #0"
      );
      return;
    }
    throw e;
  }
};

// _id is assigned by the sequence counter inside this function
export const insertMeeting = async (meeting: Omit<StoredMeeting, "_id">): Promise<InsertOneResult<StoredMeeting>> => {
  try {
    const ret = await counters.findOneAndUpdate(
      { _id: "meeting_id" },
      { $inc: { seq: 1 } },
      { returnDocument: "after" } // Ensure we get the updated document
    );

    if (!ret) {
      throw new Error("Failed to increment meeting_id sequence");
    }

    const seq = ret.seq;

    const meetingWithId = { ...meeting, _id: seq } as StoredMeeting;
    return await meetingsCollection.insertOne(meetingWithId);
  } catch (error) {
    // Report error and rethrow to allow caller or global handler to react
    // We rethrow because database failure is critical for creating a meeting
        await Logger.error("DbService", "Failed to insert meeting", { error });
    throw error;
  }
};
