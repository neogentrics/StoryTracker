using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace StoryTracker
{
    public static class UIHelper
    {
        public static void SetInitialPlaceholders(params TextBox[] textboxes)
        {
            foreach (var textbox in textboxes)
            {
                TextBox_LostFocus(textbox, null);
            }
        }

        public static void TextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox && textBox.Tag != null)
            {
                if (textBox.Text == textBox.Tag.ToString())
                {
                    textBox.Text = "";
                    textBox.SetResourceReference(Control.ForegroundProperty, "ForegroundColor");
                    textBox.FontStyle = FontStyles.Normal;
                }
            }
        }

        public static void TextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            if (sender is TextBox textBox && textBox.Tag != null)
            {
                if (string.IsNullOrWhiteSpace(textBox.Text))
                {
                    textBox.Text = textBox.Tag.ToString();
                    textBox.Foreground = Brushes.Gray;
                    textBox.FontStyle = FontStyles.Italic;
                }
            }
        }
    }
}