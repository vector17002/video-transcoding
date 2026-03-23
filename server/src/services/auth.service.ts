import bcrypt from "bcrypt";

export const hashPassword = (password: string) => {
    const hashedPassword = bcrypt.hashSync(password, 10);
    return hashedPassword;
}

export const comparePassword = (password: string, hashedPassword: string) => {
    return bcrypt.compareSync(password, hashedPassword);
}