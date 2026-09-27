import { Builder } from "@/components/builder/Builder";

export default async function BuildPage({ params, searchParams }: PageProps<"/build/[id]">) {
  const { id } = await params;
  const { auto } = await searchParams;
  return <Builder id={id} autoStart={auto === "1"} />;
}
