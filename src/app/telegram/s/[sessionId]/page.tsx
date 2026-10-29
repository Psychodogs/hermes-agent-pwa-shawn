import { TelegramConversation } from "@/components/telegram/TelegramConversation";
export default async function TelegramSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <TelegramConversation key={sessionId} sessionId={sessionId} />;
}
