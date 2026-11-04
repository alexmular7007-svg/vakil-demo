import { site } from "@/lib/site";

// schema.org builders for the public bare-act pages.

export function absoluteUrl(path: string) {
  return new URL(path, site.url).toString();
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

type ActLike = {
  title: string;
  shortTitle: string;
  actNo: string;
  enactedOn: string | null;
  repealedOn: string | null;
  source: { url: string };
};

export function legislationJsonLd(act: ActLike, path: string, abbr: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name: act.title,
    alternateName: [act.shortTitle, abbr],
    legislationIdentifier: act.actNo,
    legislationType: "Act",
    legislationJurisdiction: "IN",
    ...(act.enactedOn ? { legislationDate: act.enactedOn } : {}),
    legislationLegalForce: act.repealedOn ? "https://schema.org/NotInForce" : "https://schema.org/InForce",
    inLanguage: "en-IN",
    isBasedOn: act.source.url,
    url: absoluteUrl(path),
  };
}

export function sectionJsonLd(opts: {
  act: ActLike;
  actPath: string;
  path: string;
  abbr: string;
  sectionNo: string;
  heading: string;
}) {
  const { act, actPath, path, abbr, sectionNo, heading } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name: `${act.title}, section ${sectionNo}: ${heading}`,
    alternateName: `${abbr} s. ${sectionNo}`,
    legislationIdentifier: `${act.actNo}, section ${sectionNo}`,
    legislationType: "Section",
    legislationJurisdiction: "IN",
    legislationLegalForce: act.repealedOn ? "https://schema.org/NotInForce" : "https://schema.org/InForce",
    inLanguage: "en-IN",
    isBasedOn: act.source.url,
    isPartOf: { "@type": "Legislation", name: act.title, legislationIdentifier: act.actNo, url: absoluteUrl(actPath) },
    url: absoluteUrl(path),
  };
}
