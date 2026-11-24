import { ChatScreen } from "./ChatScreen";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { conversationId } = await params;
  const { as } = await searchParams;
  return <ChatScreen conversationId={conversationId} side={as === "seller" ? "seller" : "buyer"} />;
}
