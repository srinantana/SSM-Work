import { requireUser } from "@/lib/auth";
import { WorkspaceShell } from "./workspace-shell";
export const dynamic="force-dynamic";
export default async function ProtectedLayout({children}:{children:React.ReactNode}){
 const user=await requireUser();return <WorkspaceShell email={user.email??""}>{children}</WorkspaceShell>;
}
