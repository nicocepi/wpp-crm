"use client";

import { useFormState, useFormStatus } from "react-dom";
import { MessageCircle, Mail, CheckCircle2 } from "lucide-react";
import { sendMagicLink, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <Mail className="h-4 w-4" />
      {pending ? "Enviando..." : "Enviar magic link"}
    </Button>
  );
}

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction] = useFormState(sendMagicLink, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageCircle className="h-6 w-6" />
          </div>
          <CardTitle>WhatsApp CRM</CardTitle>
          <p className="text-sm text-muted-foreground">
            Inicia sesion con tu email
          </p>
        </CardHeader>
        <CardContent>
          {state.sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-sm">
                Te enviamos un link de acceso. Revisa tu correo y abrilo para
                entrar.
              </p>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="vos@empresa.com"
                  required
                  autoComplete="email"
                />
              </div>
              {state.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <SubmitButton />
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
