import { db } from "../config/db.js";
import { userTable } from "../models/user.model.js";
import { generateId } from "../utils/generateId.js";
import { eq } from "drizzle-orm";

export const createUser = async ({ email, password }: { email: string, password: string }) => {
    const id = generateId();
    const [user] = await db.insert(userTable).values({
        id,
        email,
        password,
    }).returning();
    return user;
};

export const findUserByEmail = async (email: string) => {
    const users = await db.select().from(userTable).where(eq(userTable.email, email));
    return users[0];
};