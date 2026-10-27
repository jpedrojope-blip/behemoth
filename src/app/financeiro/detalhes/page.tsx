import { FinanceDetailView } from "./view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FinanceDetailsPage({ searchParams }: { searchParams: SearchParams }) {
  const rawParams = await searchParams;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (typeof value === "string") params[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") params[key] = value[0];
  }

  return <FinanceDetailView params={params} />;
}
