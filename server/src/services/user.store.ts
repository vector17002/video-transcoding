import { generateId } from "../utils/generateId.js";

export type User = {
    id: string;
    email: string;
    password: string;
}

let users: User[] = [];

export const createUser = ({ email, password }: { email: string, password: string }) => {
    const user = { id: generateId(), email, password };
    users.push(user);
    return user;
};

export const findUserByEmail = (email: string) => {
    return users.find(u => u.email === email);
};