import { redirect } from "next/navigation";

export default function Home() {
  redirect("/function/tasks");
  return <>即将上线</>;
}
