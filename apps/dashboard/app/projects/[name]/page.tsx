import { ProjectPageClient } from "@/components/ProjectPageClient";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <ProjectPageClient projectName={decodeURIComponent(name)} />;
}
