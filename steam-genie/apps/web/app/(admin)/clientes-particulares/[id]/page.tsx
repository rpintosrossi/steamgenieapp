import { redirect } from 'next/navigation';

export default function ParticularClientDetailIndex({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/clientes-particulares/${params.id}/datos`);
}
