import { redirect } from 'next/navigation';

export default function BuildingDetailIndexPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/buildings/${params.id}/configuracion`);
}
