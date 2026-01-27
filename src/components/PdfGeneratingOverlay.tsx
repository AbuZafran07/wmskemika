import React from "react";
import { Loader2, FileDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PdfGeneratingOverlayProps {
  isVisible: boolean;
  progress: number;
  language?: "en" | "id";
}

export const PdfGeneratingOverlay: React.FC<PdfGeneratingOverlayProps> = ({
  isVisible,
  progress,
  language = "id",
}) => {
  if (!isVisible) return null;

  const getStatusText = () => {
    if (progress < 30) {
      return language === "en" ? "Capturing content..." : "Menangkap konten...";
    } else if (progress < 70) {
      return language === "en" ? "Generating PDF..." : "Membuat PDF...";
    } else if (progress < 100) {
      return language === "en" ? "Finalizing..." : "Menyelesaikan...";
    }
    return language === "en" ? "Complete!" : "Selesai!";
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-card border rounded-lg shadow-lg p-6 w-80 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <FileDown className="w-8 h-8 text-primary" />
            <Loader2 className="w-4 h-4 absolute -bottom-1 -right-1 animate-spin text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {language === "en" ? "Saving PDF" : "Menyimpan PDF"}
            </h3>
            <p className="text-sm text-muted-foreground">{getStatusText()}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{Math.round(progress)}%</p>
        </div>
      </div>
    </div>
  );
};

export default PdfGeneratingOverlay;
