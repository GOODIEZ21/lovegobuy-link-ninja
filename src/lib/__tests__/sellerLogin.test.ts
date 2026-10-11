import { describe, it, expect } from "vitest";
import { sellerLoginEmail } from "../sellerLogin";
describe("seller login", () => {
  it("maps plain login to an account address", () => {
    expect(sellerLoginEmail(" Momo ")).toBe("momo@sellers.pkmreps.app");
  });
  it("keeps real e-mails", () => {
    expect(sellerLoginEmail("a@b.pl")).toBe("a@b.pl");
  });
});
