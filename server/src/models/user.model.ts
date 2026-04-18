import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userTable = pgTable('userTable', {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    password: text('password').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
})

export type User = typeof userTable.$inferSelect;