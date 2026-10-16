import { SeoLanding, seoMetadata } from "@/components/SeoLanding";
import { seoPage } from "@/lib/seo";

const page = seoPage("/no-code-app-builder")!;
export const metadata = seoMetadata(page);

export default function Page() {
  return <SeoLanding page={page} />;
}
