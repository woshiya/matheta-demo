import { useParams } from "react-router-dom";
import DiagnosticTest from "../DiagnosticTest";

export default function StudentDiagnosticSessionRoute() {
  const { classId, sessionId } = useParams();
  return <DiagnosticTest classId={classId} sessionId={sessionId} />;
}
