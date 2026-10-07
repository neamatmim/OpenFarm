import { whoMayOpenTheFarm } from "@OpenFarm/auth/first-account";
import { describe, expect, it } from "vitest";

// Before any Farm exists, whoever opens the first account and names the Farm becomes its Owner. On a server the
// public can reach, that is a race with anybody who found the address — so the server names the Owner's address.
// Said here rather than through the door itself: every test file shares one database, and it always holds a Farm.

const OWNER = "owner@farm.example.com";

describe("the first account", () => {
  it("opens for the address the server names, however it is typed", () => {
    expect(
      whoMayOpenTheFarm(" Owner@Farm.Example.com ", {
        ownerEmail: OWNER,
        production: true,
        setupCodeRight: true,
      })
    ).toBe("open");
  });

  it("on a production server, does not open for the right address without the setup code from the server's log", () => {
    expect(
      whoMayOpenTheFarm(OWNER, { ownerEmail: OWNER, production: true })
    ).toBe("setup_code_wrong");
    expect(
      whoMayOpenTheFarm(OWNER, {
        ownerEmail: OWNER,
        production: true,
        setupCodeRight: false,
      })
    ).toBe("setup_code_wrong");
    // In development there is no race to lose, and no log anybody reads.
    expect(
      whoMayOpenTheFarm(OWNER, { ownerEmail: OWNER, production: false })
    ).toBe("open");
  });

  it("does not open for anybody else, even on a server that is not production", () => {
    expect(
      whoMayOpenTheFarm("stranger@example.com", {
        ownerEmail: OWNER,
        production: true,
      })
    ).toBe("not_the_owner");
    expect(
      whoMayOpenTheFarm("stranger@example.com", {
        ownerEmail: OWNER,
        production: false,
      })
    ).toBe("not_the_owner");
  });

  it("opens for nobody on a production server that names nobody, and says what to set", () => {
    expect(
      whoMayOpenTheFarm(OWNER, { ownerEmail: undefined, production: true })
    ).toBe("owner_not_named");
  });

  it("is left open in development, where there is no race to lose", () => {
    expect(
      whoMayOpenTheFarm("anybody@example.com", {
        ownerEmail: undefined,
        production: false,
      })
    ).toBe("open");
  });
});
