import fs from "fs";
import assert from "assert";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { after, before, beforeEach } from "mocha";

const MY_PROJECT_ID = "security-rules-from-tod";

const myId = "user_abc";
const myUserData = { name: "User ABC", email: "abc@gamil.com" };
const theirId = "user_xyz";
const theirUserData = { name: "User XYZ", email: "xyz@gamil.com" };

describe("Our Social App", () => {
  let testEnv = null;
  let myUser = null;
  let theirUser = null;
  let noUser = null;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: MY_PROJECT_ID,
      firestore: {
        rules: fs.readFileSync("../firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
    //clean database
    await testEnv.clearFirestore();

    //initial users in db
    await testEnv.withSecurityRulesDisabled((context) => {
      return context.firestore().collection("users").doc(myId).set(myUserData);
    });
    await testEnv.withSecurityRulesDisabled((context) => {
      return context
        .firestore()
        .collection("users")
        .doc(theirId)
        .set(theirUserData);
    });
  });

  beforeEach(async () => {
    myUser = testEnv.authenticatedContext(myId); //auth user - me
    theirUser = testEnv.authenticatedContext(theirId); //auth user - them
    noUser = testEnv.unauthenticatedContext(); //not logged in
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.clearFirestore();
    await testEnv.cleanup(); //exits the test
  });

  it("Understands basic addition", () => {
    assert.equal(2 + 2, 4);
  });

  it("Can read items in the read-only collection", async () => {
    const testDoc = noUser.firestore().collection("readonly").doc("testDoc");
    await assertSucceeds(testDoc.get());
  });

  it("Can't write to items in the read-only collection", async () => {
    const testDoc = noUser.firestore().collection("readonly").doc("testDoc2");
    await assertFails(testDoc.set({ foo: "bar" }));
  });

  it("Can write to a user document with the same ID as our user", async () => {
    const testDoc = myUser.firestore().collection("users").doc(myId);
    await assertSucceeds(testDoc.set({ foo: "bar" }));
  });

  it("Can't write to a user document with the different ID as our user", async () => {
    const testDoc = myUser.firestore().collection("users").doc(theirId);
    await assertFails(testDoc.set({ foo: "bar" }));
  });

  it("Can read posts marked public", async () => {
    const testQuery = noUser
      .firestore()
      .collection("posts")
      .where("visibility", "==", "public");
    await assertSucceeds(testQuery.get());
  });

  it("Can query personal posts", async () => {
    const testQuery = myUser
      .firestore()
      .collection("posts")
      .where("authorId", "==", myId);
    await assertSucceeds(testQuery.get());
  });

  it("Can't query all posts", async () => {
    const testQuery = myUser.firestore().collection("posts");
    await assertFails(testQuery.get());
  });

  it("Can read a single public post", async () => {
    await testEnv.withSecurityRulesDisabled((context) => {
      return context
        .firestore()
        .collection("posts")
        .doc("public_post")
        .set({ authorId: theirId, visibility: "public" });
    });
    const testDoc = noUser.firestore().collection("posts").doc("public_post");
    await assertSucceeds(testDoc.get());
  });

  it("Can read a private public post belonging to the user", async () => {
    await testEnv.withSecurityRulesDisabled((context) => {
      return context
        .firestore()
        .collection("posts")
        .doc("private_post")
        .set({ authorId: myId, visibility: "private" });
    });
    const testDoc = myUser.firestore().collection("posts").doc("private_post");
    await assertSucceeds(testDoc.get());
  });

  it("Can't read a private public post belonging to another user", async () => {
    await testEnv.withSecurityRulesDisabled((context) => {
      return context
        .firestore()
        .collection("posts")
        .doc("private_post")
        .set({ authorId: theirId, visibility: "private" });
    });
    const testDoc = myUser.firestore().collection("posts").doc("private_post");
    await assertFails(testDoc.get());
  });
});
