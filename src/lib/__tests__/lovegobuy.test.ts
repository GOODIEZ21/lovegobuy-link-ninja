import { describe, it, expect } from "vitest";
import { convertLink } from "../linkConverter";

describe("LoveGoBuy link conversion", () => {
  it("converts 1688 links", () => {
    expect(convertLink("https://detail.1688.com/offer/978136831309.html", "LoveGoBuy")).toBe(
      "https://www.lovegobuy.com/product?id=978136831309&shop_type=ali_1688&invite_code=7KN8NW",
    );
  });
  it("converts weidian links", () => {
    expect(convertLink("https://weidian.com/item.html?itemID=7866805981", "LoveGoBuy")).toBe(
      "https://www.lovegobuy.com/product?id=7866805981&shop_type=weidian&invite_code=7KN8NW",
    );
  });
  it("converts old Litbuy links to LoveGoBuy", () => {
    expect(
      convertLink("https://litbuy.com/product/weidian/7702256586?linkSearch=true&inviteCode=PKMR", "LoveGoBuy"),
    ).toBe("https://www.lovegobuy.com/product?id=7702256586&shop_type=weidian&invite_code=7KN8NW");
  });
});

import { productAgentLink } from "../linkConverter";
describe("product agent link matching", () => {
  const p = {
    agent_links: {
      LoveGoBuy: "https://www.lovegobuy.com/product?id=996985791005&shop_type=ali_1688&invite_code=7KN8NW",
      Kakaobuy: "https://item.kakobuy.com/item/details?url=x&affcode=six7n",
      USFans: "https://www.usfans.com/product/1/996985791005?ref=5FTXZW",
    },
  };
  it("matches agent names regardless of spelling", () => {
    expect(productAgentLink(p, "Lovegobuy")).toBe(p.agent_links.LoveGoBuy);
    expect(productAgentLink(p, "KakoBuy")).toBe(p.agent_links.Kakaobuy);
    expect(productAgentLink(p, "UsFans")).toBe(p.agent_links.USFans);
  });
  it("builds LoveGoBuy product link from another agent link when missing", () => {
    expect(
      productAgentLink({ agent_links: { USFans: "https://www.usfans.com/product/3/7702256586?ref=5FTXZW" } }, "Lovegobuy"),
    ).toBe("https://www.lovegobuy.com/product?id=7702256586&shop_type=weidian&invite_code=7KN8NW");
  });
});
