import React from "react";
import { Users, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";

function ClassCard({ id, name, code, students, assignments }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/teacher/class/${id}`)}
      className="bg-white shadow-md rounded-xl p-6 hover:shadow-lg transition cursor-pointer border hover:border-purple-500"
    >
      <h3 className="text-lg font-semibold mb-2">
        {name}
      </h3>

      <p className="text-sm text-gray-500 mb-4">
        Class Code: {code}
      </p>

      <div className="flex justify-between text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Users size={16} />
          {students} Students
        </div>

        <div className="flex items-center gap-2">
          <BookOpen size={16} />
          {assignments} Assignments
        </div>
      </div>
    </div>
  );
}

export default ClassCard;