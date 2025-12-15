import { MongoClient, Db, Collection, Document, InsertOneResult } from "mongodb";

let db: Db;
export let meetingsCollection: Collection<Document>;
export let audioCollection: Collection<Document>;
export let counters: Collection<any>;

export const initDb = async (): Promise<void> => {
  if (!process.env.COUNCIL_DB_URL) {
    throw new Error("COUNCIL_DB_URL environment variable not set.");
  }
  const mongoClient = new MongoClient(process.env.COUNCIL_DB_URL);

  if (!process.env.COUNCIL_DB_PREFIX) {
    throw new Error("COUNCIL_DB_PREFIX environment variable not set.");
  }
  console.log(`[init] COUNCIL_DB_PREFIX is ${process.env.COUNCIL_DB_PREFIX}`);

  db = mongoClient.db(process.env.COUNCIL_DB_PREFIX);
  meetingsCollection = db.collection("meetings");
  audioCollection = db.collection("audio");
  counters = db.collection("counters");

  await initializeCounters();
};

const initializeCounters = async (): Promise<void> => {
  try {
    await counters.insertOne({ _id: "meeting_id", seq: 0 });
    console.log("[init] No meeting ID found, created initial meeting #0");
  } catch (e: any) {
    if (e.errorResponse?.code === 11000) {
      console.log(
        "[init] Meeting ID counter already found in database. Not creating meeting #0"
      );
      return;
    }
    throw e;
  }
};

export const insertMeeting = async (meeting: Document): Promise<InsertOneResult<Document>> => {
  // In v6, findOneAndUpdate returns ModifyResult { value: Document ... }
  // We explicitly cast to any to replicate original JS behavior if it was relying on checking properties loosely.
  // Original: const ret = ...; meeting._id = ret.seq; 
  // This implies 'ret' had a 'seq' property. 
  // If ret is ModifyResult, it doesn't have 'seq', it has 'value' which has 'seq'.
  // However, maybe valid runtime code was actually wrong but working due to structure?
  // Or maybe it was using an older driver where it returned the doc directly?
  // Let's assume it returns the doc in `value` prop based on v6 specs.

  const ret = await counters.findOneAndUpdate(
    { _id: "meeting_id" },
    { $inc: { seq: 1 } } as any
  ) as any;

  // Polyfill logic: try to find seq on ret (if legacy) or ret.value (if modern)
  const seq = ret.seq ?? ret.value?.seq;

  meeting._id = seq;
  return await meetingsCollection.insertOne(meeting);
};
