using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace StoryTracker
{
    public class Story
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty; // Default to empty
        public string StoryType { get; set; } = string.Empty;
        public string Genre { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string StoryText { get; set; } = string.Empty;
        public int WordCount { get; set; }
    }
}
