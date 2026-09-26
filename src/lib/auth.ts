import { cloud } from "./cloud";

export const usernamePattern = /^[a-z][a-z0-9_]{2,23}$/;
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}
export function usernameEmail(username: string): string {
  return `${normalizeUsername(username)}@costsplit.invalid`;
}

export async function signUp(username: string, password: string, upgradeAnonymous: boolean): Promise<void> {
  const handle = normalizeUsername(username);
  if (!usernamePattern.test(handle)) throw new Error("Use 3–24 letters, numbers, or underscores. Start with a letter.");
  if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
  if (upgradeAnonymous) {
    const { error } = await cloud().auth.updateUser({ email: usernameEmail(handle), password });
    if (error) throw error;
  } else {
    const { data, error } = await cloud().auth.signUp({ email: usernameEmail(handle), password });
    if (error) throw error;
    if (!data.session) throw new Error("Account created, but sign-in needs confirmation. Check the project's email confirmation setting.");
  }
}

export async function signIn(username: string, password: string): Promise<void> {
  const handle = normalizeUsername(username);
  if (!usernamePattern.test(handle)) throw new Error("Enter a valid username.");
  const { error } = await cloud().auth.signInWithPassword({ email: usernameEmail(handle), password });
  if (error) throw new Error("Incorrect username or password.");
}
