namespace StoryTracker.MAUI;

public class Chapter
{
    public int Id { get; set; }
    public int StoryId { get; set; }
    public int ChapterNumber { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty; // This will store HTML
    public int WordCount { get; set; }
}