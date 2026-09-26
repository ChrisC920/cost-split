import { Card, LinkButton, Screen } from "@/components/ui";

export default function JoinPage() {
  return <Screen><Card className="mt-8 p-5 space-y-4">
    <h1 className="text-2xl font-semibold">Invitations have moved</h1>
    <p className="text-muted">Create an account, then ask the group owner to invite your username. Your invitation will appear on the home screen.</p>
    <LinkButton href="/" variant="primary">Go to Cost Split</LinkButton>
  </Card></Screen>;
}
