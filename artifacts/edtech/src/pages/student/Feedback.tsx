import { useState } from "react";
import { useListClasses, useSubmitFeedback, getListClassesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Star, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="transition-transform hover:scale-110"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          data-testid={`star-${star}`}
        >
          <Star
            size={28}
            className={`${(hovered || value) >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} transition-colors`}
          />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">
        {value > 0 ? ["", "Poor", "Fair", "Good", "Very Good", "Excellent"][value] : "Select rating"}
      </span>
    </div>
  );
}

function FeedbackDialog({ classId, classTitle }: { classId: number; classTitle: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const submitFeedback = useSubmitFeedback();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = () => {
    if (rating === 0) {
      setError("Please select a rating");
      return;
    }
    setError("");
    submitFeedback.mutate(
      { data: { classId, rating, comment: comment || null } },
      {
        onSuccess: () => {
          toast({ title: "Feedback submitted! Thank you." });
          setOpen(false);
          setRating(0);
          setComment("");
          queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
        },
        onError: (err: any) => {
          setError(err?.data?.error ?? "Failed to submit feedback");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-testid={`button-feedback-${classId}`}>
          <Star size={14} className="mr-1" />
          Give Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback for "{classTitle}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2">
            <Label>Your Rating</Label>
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comment">Comments (optional)</Label>
            <Textarea
              id="comment"
              placeholder="Share your experience with this class..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              data-testid="input-feedback-comment"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={submitFeedback.isPending}
            data-testid="button-submit-feedback"
          >
            <Send size={14} className="mr-2" />
            {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StudentFeedback() {
  const { data: classes = [], isLoading } = useListClasses();
  const enrolledAndCompleted = classes.filter((c) => c.status === "completed" || c.status === "live");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Class Feedback</h1>
        <p className="text-muted-foreground text-sm mt-1">Share your experience to help improve teaching quality</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Star size={16} className="text-primary" />
            Classes You Can Rate ({enrolledAndCompleted.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
            </div>
          ) : enrolledAndCompleted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed or live classes to rate yet. Enroll in classes and attend them first.</p>
          ) : (
            <div className="space-y-3">
              {enrolledAndCompleted.map((cls) => (
                <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg border border-border" data-testid={`feedback-class-${cls.id}`}>
                  <div>
                    <p className="text-sm font-medium">{cls.title}</p>
                    <p className="text-xs text-muted-foreground">{cls.subject} · by {cls.adminName ?? "Teacher"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cls.status === "live" ? "destructive" : "default"}>{cls.status}</Badge>
                    <FeedbackDialog classId={cls.id} classTitle={cls.title} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
