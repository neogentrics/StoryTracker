using Microsoft.Win32;
using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;

namespace StoryTracker
{
    public class ExportService
    {
        public void ExportToTxt(RichTextBox richTextBox, string fileName)
        {
            var saveFileDialog = new SaveFileDialog
            {
                FileName = $"{fileName}.txt",
                Filter = "Text Document (*.txt)|*.txt"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                string richText = new TextRange(richTextBox.Document.ContentStart, richTextBox.Document.ContentEnd).Text;
                File.WriteAllText(saveFileDialog.FileName, richText);
            }
        }

        public void ExportToRtf(RichTextBox richTextBox, string fileName)
        {
            var saveFileDialog = new SaveFileDialog
            {
                FileName = $"{fileName}.rtf",
                Filter = "Rich Text Format (*.rtf)|*.rtf"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                var textRange = new TextRange(richTextBox.Document.ContentStart, richTextBox.Document.ContentEnd);
                using (var fileStream = new FileStream(saveFileDialog.FileName, FileMode.Create))
                {
                    textRange.Save(fileStream, DataFormats.Rtf);
                }
            }
        }
    }
}