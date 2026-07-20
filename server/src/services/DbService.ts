import type { StoredMeeting, StoredAudio, Counter } from "@models/DBModels.js";
import { MongoClient, Db, Collection, InsertOneResult } from "mongodb";
import { Logger } from "@utils/Logger.js";
import { config } from "../config.js";

const AUTOPLAY_INDEX_SPEC = { meetingComplete: 1, language: 1, date: 1 } as const;
const AUTOPLAY_INDEX_NAME = "autoplay_meetingComplete_language_date";
const OLD_AUTOPLAY_INDEX_NAME = "autoplay_meetingComplete_date_language";

const LIVEKEY_INDEX_SPEC = { liveKey: 1 } as const;
const LIVEKEY_INDEX_NAME = "liveKey_unique";

let db: Db;
let mongoClient: MongoClient | null = null;
let activeConnectionKey: string | null = null;
export let meetingsCollection: Collection<StoredMeeting>;
export let audioCollection: Collection<StoredAudio>;
export let counters: Collection<Counter>;

export const initDb = async (dbUrl?: string, dbPrefix?: string): Promise<void> => {
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
  activeConnectionKey = connectionKey;

  await initializeCounters();
  await ensureMeetingIndexes();
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

export const closeDb = async (): Promise<void> => {
  if (!mongoClient) {
    return;
  }

  await mongoClient.close();
  mongoClient = null;
  activeConnectionKey = null;
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
