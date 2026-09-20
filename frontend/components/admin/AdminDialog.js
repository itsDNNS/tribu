import { ShieldCheck } from "lucide-react";
import CalendarDialog from "../calendar/CalendarDialog";

export default function AdminDialog(props) {
  return (
    <CalendarDialog
      {...props}
      icon={ShieldCheck}
      className="admin-dialog"
      subtitle={null}
    />
  );
}
