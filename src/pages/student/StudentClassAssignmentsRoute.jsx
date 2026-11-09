import { useOutletContext, useParams } from "react-router-dom";
import StudentClassAssignments from "./StudentClassAssignments";
import { useNavigate } from "react-router-dom";

export default function StudentClassAssignmentsRoute() {
  const { classId } = useParams();
  const parsedClassId = parseInt(classId, 10);
  const { classes } = useOutletContext() || { classes: [] };
  const navigate = useNavigate();

  const selected = (classes || []).find((c) => String(c.id) === String(parsedClassId)) || null;

  return (
    <StudentClassAssignments
      classId={parsedClassId}
      classLabel={selected ? selected.name : `Class ${classId}`}
      classObj={selected}
      onOpenAssignment={(assignment, mode) => {
        // For MVP we use a single student assignment page.
        // Mode can be used later to open read-only view.
        navigate(`/student/assignments/${assignment?.id}`);
      }}
    />
  );
}
