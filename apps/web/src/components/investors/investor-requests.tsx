import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Section } from "@/components/page";
import {
  REQUESTS_ANCHOR,
  WhatTheyAsked,
  WhereItStands,
} from "@/components/ventures/request-parts";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * One Investor's Requests to Join across every Venture, the newest first: what they asked for, the Owner's answer,
 * where each stands and why the farm closed it if it did — their whole conversation with the farm in one place, said
 * as the Venture's own list says it. Each leads to its Venture's Requests, where it is answered. Nothing for somebody
 * who never asked through the portal.
 */
export const InvestorRequests = ({ investorId }: { investorId: string }) => {
  const { t } = useLanguage();
  const theirs = useQuery(
    orpc.investors.requests.queryOptions({ input: { id: investorId } })
  );
  const requests = theirs.data ?? [];
  if (requests.length === 0) {
    return null;
  }
  return (
    <Section
      description={t("investors.requests.hint")}
      title={t("ventures.requests.title")}
    >
      <ul className="divide-border -my-3 flex flex-col divide-y">
        {requests.map((one) => (
          <li
            className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            key={one.id}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                className="font-medium break-words hover:underline"
                hash={REQUESTS_ANCHOR}
                params={{ ventureId: one.ventureId }}
                search={{ tab: "investors" }}
                to="/ventures/$ventureId"
              >
                {one.ventureName}
              </Link>
              <WhatTheyAsked one={one} />
            </div>
            <WhereItStands one={one} />
          </li>
        ))}
      </ul>
    </Section>
  );
};
