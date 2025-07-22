using iTextSharp.text;
using iTextSharp.text.pdf;
using Microsoft.Win32;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using Xceed.Words.NET;
using iTextSharp.text;
using iTextSharp.text.pdf;
using iTextSharp.tool.xml; // This one will now work
using Microsoft.Win32;


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
        public void ExportToDocx(FlowDocument document, string fileName)
        {
            var saveFileDialog = new SaveFileDialog
            {
                FileName = $"{fileName}.docx",
                Filter = "Word Document (*.docx)|*.docx"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                // Create the new, empty .docx file
                using (var doc = DocX.Create(saveFileDialog.FileName))
                {
                    // Save the WPF document's content to a memory stream
                    var textRange = new TextRange(document.ContentStart, document.ContentEnd);
                    using (var memoryStream = new MemoryStream())
                    {
                        textRange.Save(memoryStream, DataFormats.XamlPackage);
                        memoryStream.Position = 0;

                        // Load the memory stream into a temporary DocX document
                        using (var tempDocument = DocX.Load((Stream)memoryStream))
                        {
                            // THIS IS THE FIX:
                            // We explicitly call the InsertDocument method and provide
                            // the 'append' argument to remove the ambiguity.
                            doc.InsertDocument(tempDocument, true);
                        }
                    }
                    // Save the final, merged document
                    doc.Save();
                }
            }
        }
        public void ExportToPdf(FlowDocument document, string fileName)
        {
            var saveFileDialog = new SaveFileDialog
            {
                FileName = $"{fileName}.pdf",
                Filter = "PDF Document (*.pdf)|*.pdf"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                var textRange = new TextRange(document.ContentStart, document.ContentEnd);
                using (var memoryStream = new MemoryStream())
                {
                    textRange.Save(memoryStream, DataFormats.Xaml);
                    memoryStream.Position = 0;

                    // This is the fix: Wrap the MemoryStream in a StreamReader
                    using (var streamReader = new StreamReader(memoryStream))
                    {
                        using (var fileStream = new FileStream(saveFileDialog.FileName, FileMode.Create))
                        {
                            var pdfDocument = new Document(PageSize.A4);
                            var writer = PdfWriter.GetInstance(pdfDocument, fileStream);
                            pdfDocument.Open();
                            // Pass the StreamReader to the parser
                            XMLWorkerHelper.GetInstance().ParseXHtml(writer, pdfDocument, streamReader);
                            pdfDocument.Close();
                        }
                    }
                }
            }
        }
        public void ExportToHtml(FlowDocument document, string fileName)
        {
            // Note: A true RTF-to-HTML conversion is complex.
            // This will save the content as plain text within an HTML structure.
            var saveFileDialog = new SaveFileDialog
            {
                FileName = $"{fileName}.html",
                Filter = "HTML File (*.html)|*.html"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                string plainText = new TextRange(document.ContentStart, document.ContentEnd).Text;
                string html = $"<html><body><pre>{System.Net.WebUtility.HtmlEncode(plainText)}</pre></body></html>";
                File.WriteAllText(saveFileDialog.FileName, html);
            }
        }
        public void ExportToXaml(FlowDocument document, string fileName)
        {
            var saveFileDialog = new SaveFileDialog
            {
                FileName = $"{fileName}.xaml",
                Filter = "XAML Package (*.xaml)|*.xaml"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                var textRange = new TextRange(document.ContentStart, document.ContentEnd);
                using (var fileStream = new FileStream(saveFileDialog.FileName, FileMode.Create))
                {
                    textRange.Save(fileStream, DataFormats.XamlPackage);
                }
            }
        }
    }
}