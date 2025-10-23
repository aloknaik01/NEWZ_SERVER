import { createEmailVerificationTable } from "../models/emailVerificationsTable.js";
import { createReferalsTable } from "../models/referralsTable.js";
import { createUserProfileTable } from "../models/userProfileTable.js";
import { createUserTable } from "../models/userTable.js";
import { createUserWalletsTable } from "../models/userWalletsTable.js";
import { createRefreshToeknTable } from "../models/refreshTokensTable.js";
import { createLoginHistoryTable } from "../models/loginHistoryTable.js";



export async function createTables() {
  try {
    console.log("Starting table creation...");
    await createUserTable();
    await createUserProfileTable();
    await createReferalsTable();
    await createRefreshToeknTable();
    await createLoginHistoryTable();
    await createUserWalletsTable();
    await createEmailVerificationTable();
    await createLoginHistoryTable();
    console.log("All tables created successfully.");
  } catch (error) {
    console.error("Failed to create tables:", error);
    process.exit(1);
  }
}
