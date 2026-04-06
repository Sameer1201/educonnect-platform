import { Download, ArrowRight } from "lucide-react";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-[22px] font-bold text-gray-900">{title}</h2>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" />
          Download Analysis
        </button>
        <button className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors">
          View Solution
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
