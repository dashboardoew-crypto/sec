import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#061a2b] p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0d233a] p-6 shadow-xl text-white">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="h-8 w-8 text-red-400 shrink-0" />
          <h1 className="text-2xl font-bold">404 Page Not Found</h1>
        </div>
        <p className="text-sm text-white/70">
          The requested page does not exist or you do not have permission to view it.
        </p>
      </div>
    </div>
  );
}
