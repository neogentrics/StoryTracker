using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;

namespace StoryTracker
{
    public class EditorService
    {
        public void ToggleStrikethrough(RichTextBox rtb)
        {
            var currentDecorations = rtb.Selection.GetPropertyValue(Inline.TextDecorationsProperty) as TextDecorationCollection;
            if (currentDecorations != null && currentDecorations.Count > 0 && currentDecorations.Equals(TextDecorations.Strikethrough))
            {
                rtb.Selection.ApplyPropertyValue(Inline.TextDecorationsProperty, null);
            }
            else
            {
                rtb.Selection.ApplyPropertyValue(Inline.TextDecorationsProperty, TextDecorations.Strikethrough);
            }
        }

        public void ChangeFontFamily(RichTextBox rtb, string fontFamily)
        {
            rtb.Selection.ApplyPropertyValue(TextElement.FontFamilyProperty, new FontFamily(fontFamily));
        }

        public void ChangeFontSize(RichTextBox rtb, string fontSize)
        {
            if (double.TryParse(fontSize, out double newSize))
            {
                rtb.Selection.ApplyPropertyValue(TextElement.FontSizeProperty, newSize);
            }
        }

        public void ChangeTextColor(RichTextBox rtb, string colorName)
        {
            var converter = new BrushConverter();
            if (converter.ConvertFromString(colorName) is Brush newBrush)
            {
                rtb.Selection.ApplyPropertyValue(TextElement.ForegroundProperty, newBrush);
            }
        }
    }
}