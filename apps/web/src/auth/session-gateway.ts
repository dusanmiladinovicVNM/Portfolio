export interface AuthSession {
  readonly accessToken: string;
  readonly email: string | null;
}

export interface SessionGateway {
  getSession(): Promise<AuthSession | null>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}
