import { ProjectPageClient } from "@/components/ProjectPageClient";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ finding?: string }>;
}) {
  const { name } = await params;
  const { finding } = await searchParams;
  return (
    <ProjectPageClient
      projectName={decodeURIComponent(name)}
      initialFindingId={finding}
    />
  );
}
