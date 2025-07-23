namespace StoryTracker.MAUI;

public class Story
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string StoryType { get; set; } = string.Empty;
    public string Genre { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
}