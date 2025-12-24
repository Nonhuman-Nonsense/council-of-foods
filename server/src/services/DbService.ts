import type { Meeting, Audio, Counter } from "@models/DBModels.js";
import { MongoClient, Db, Collection, InsertOneResult } from "mongodb";
import { Logger } from "@utils/Logger.js";
import { config } from "../config.js";

let db: Db;
export let meetingsCollection: Collection<Meeting>;
export let audioCollection: Collection<Audio>;
export let counters: Collection<Counter>;

export const initDb = async (dbUrl?: string, dbPrefix?: string): Promise<void> => {
  // Config is already validated by the time we import this, but allow overrides for testing
  const url = dbUrl || config.COUNCIL_DB_URL;
  const prefix = dbPrefix || config.COUNCIL_DB_PREFIX;

  Logger.info(`init`, `COUNCIL_DB_PREFIX is ${prefix}`);
  Logger.info("init", "Initializing Database");
  const mongoClient = new MongoClient(url);

  db = mongoClient.db(prefix);
  meetingsCollection = db.collection<Meeting>("meetings");
  audioCollection = db.collection<Audio>("audio");
  counters = db.collection<Counter>("counters");

  await initializeCounters();
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

// We use 'Omit<Meeting, "_id">' because _id is assigned by the logic inside
export const insertMeeting = async (meeting: Omit<Meeting, "_id">): Promise<InsertOneResult<Meeting>> => {
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

    // Cast to Meeting including the new _id
    const meetingWithId = { ...meeting, _id: seq } as Meeting;
    return await meetingsCollection.insertOne(meetingWithId);
  } catch (error) {
    // Report error and rethrow to allow caller or global handler to react
    // We rethrow because database failure is critical for creating a meeting
    await Logger.error("DbService", "Failed to insert meeting", error);
    throw error;
  }
};
