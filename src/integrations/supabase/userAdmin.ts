import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  isSelf: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

export type UserRole = "user" | "admin";

export type NewUserInput = {
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
};

export type UserAdminClient = {
  listUsers(): Promise<ManagedUser[]>;
  createUser(input: NewUserInput): Promise<void>;
  deleteUser(userId: string): Promise<void>;
};

async function readErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown };
      if (typeof body.error === "string" && body.error) return body.error;
    } catch {
      // jatuh ke pesan umum di bawah
    }
  }
  return error instanceof Error && error.message ? error.message : "Permintaan ke server gagal.";
}

export function createUserAdminClient(client: SupabaseClient): UserAdminClient {
  async function call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.functions.invoke("manage-users", { body });
    if (error) throw new Error(await readErrorMessage(error));
    return data as T;
  }

  return {
    async listUsers() {
      const result = await call<{ users: ManagedUser[] }>({ action: "list" });
      return result.users;
    },
    async createUser(input) {
      await call({ action: "create", ...input });
    },
    async deleteUser(userId) {
      await call({ action: "delete", userId });
    },
  };
}
