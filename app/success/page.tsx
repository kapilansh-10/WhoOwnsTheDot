import { redirect } from "next/navigation";

export default function SuccessPage() {
  redirect("/?owned=1");
}
