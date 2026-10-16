import {requireTrialAccess} from "@/lib/trial";
import {ModuleStatus} from "../module-status";
export default async function Page(){await requireTrialAccess();return <ModuleStatus type="upload"/>;}
