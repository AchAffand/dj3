import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";

vi.mock("./AuthProvider", () => ({
  useAuth: () => ({ signIn: vi.fn(async () => null) }),
}));

describe("SignInPage branding", () => {
  it("shows the DJ3 Engineering logo", () => {
    render(<SignInPage />);
    expect(screen.getByRole("img", { name: "DJ3 Engineering" })).toHaveAttribute("src", "/dj3-engineering-logo.png");
  });
});
