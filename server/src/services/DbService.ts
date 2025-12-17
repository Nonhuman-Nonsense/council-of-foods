import { MongoClient, Db, Collection, InsertOneResult } from "mongodb";
import { Meeting, Audio, Counter } from "@models/DBModels.js";
import { Logger } from "@utils/Logger.js";

let db: Db;
export let meetingsCollection: Collection<Meeting>;
export let audioCollection: Collection<Audio>;
export let counters: Collection<Counter>;

export const initDb = async (): Promise<void> => {
  if (!process.env.COUNCIL_DB_URL) {
    throw new Error("COUNCIL_DB_URL environment variable not set.");
  }
  const mongoClient = new MongoClient(process.env.COUNCIL_DB_URL);

  if (!process.env.COUNCIL_DB_PREFIX) {
    throw new Error("COUNCIL_DB_PREFIX environment variable not set.");
  }
  Logger.info(`init`, `COUNCIL_DB_PREFIX is ${process.env.COUNCIL_DB_PREFIX}`);

  db = mongoClient.db(process.env.COUNCIL_DB_PREFIX);
  meetingsCollection = db.collection<Meeting>("meetings");
  audioCollection = db.collection<Audio>("audio");
  counters = db.collection<Counter>("counters");

  await initializeCounters();
};

const initializeCounters = async (): Promise<void> => {
  try {
    await counters.insertOne({ _id: "meeting_id", seq: 0 });
    Logger.info("init", "No meeting ID found, created initial meeting #0");
  } catch (e: any) {
    if (e.errorResponse?.code === 11000) {
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
  const ret = await counters.findOneAndUpdate(
    { _id: "meeting_id" },
    { $inc: { seq: 1 } } as any
  ) as any;

  // Polyfill logic: try to find seq on ret (if legacy) or ret.value (if modern)
  const seq = ret.seq ?? ret.value?.seq;

  // Cast to Meeting including the new _id
  const meetingWithId = { ...meeting, _id: seq } as Meeting;
  return await meetingsCollection.insertOne(meetingWithId);
};
