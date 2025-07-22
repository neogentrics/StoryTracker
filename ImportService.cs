using Microsoft.Win32;
using System;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Documents;
using Xceed.Words.NET;
using iTextSharp.text.pdf;
using iTextSharp.text.pdf.parser;

namespace StoryTracker
{
    public class ImportService
    {
        public string ImportDocx()
        {
            var openFileDialog = new OpenFileDialog
            {
                Filter = "Word Document (*.docx)|*.docx"
            };

            if (openFileDialog.ShowDialog() == true)
            {
                using (var doc = DocX.Load(openFileDialog.FileName))
                {
                    // For simplicity, we'll convert the .docx to RTF in memory
                    // to load it into the RichTextBox.
                    var tempDoc = new FlowDocument();
                    // DocX library doesn't have a direct to RTF, so we insert paragraphs.
                    foreach (var para in doc.Paragraphs)
                    {
                        tempDoc.Blocks.Add(new Paragraph(new Run(para.Text)));
                    }

                    var textRange = new TextRange(tempDoc.ContentStart, tempDoc.ContentEnd);
                    using (var memoryStream = new MemoryStream())
                    {
                        textRange.Save(memoryStream, DataFormats.Rtf);
                        return Encoding.ASCII.GetString(memoryStream.ToArray());
                    }
                }
            }
            return null;
        }
        public string ImportPdf()
        {
            var openFileDialog = new OpenFileDialog
            {
                Filter = "PDF Document (*.pdf)|*.pdf"
            };

            if (openFileDialog.ShowDialog() == true)
            {
                var sb = new StringBuilder();
                using (var reader = new PdfReader(openFileDialog.FileName))
                {
                    for (int page = 1; page <= reader.NumberOfPages; page++)
                    {
                        sb.Append(PdfTextExtractor.GetTextFromPage(reader, page));
                    }
                }

                // Convert the extracted plain text to a simple RTF document
                var doc = new FlowDocument(new Paragraph(new Run(sb.ToString())));
                var range = new TextRange(doc.ContentStart, doc.ContentEnd);
                using (var ms = new MemoryStream())
                {
                    range.Save(ms, DataFormats.Rtf);
                    return Encoding.ASCII.GetString(ms.ToArray());
                }
            }
            return null;
        }
        public string ImportHtml()
        {
            var openFileDialog = new OpenFileDialog
            {
                Filter = "HTML Files (*.html;*.htm)|*.html;*.htm"
            };

            if (openFileDialog.ShowDialog() == true)
            {
                // We will convert the HTML to RTF in memory to load it
                using (var stringReader = new StringReader(File.ReadAllText(openFileDialog.FileName)))
                {
                    var doc = new FlowDocument();
                    // iTextSharp doesn't directly convert HTML to RTF,
                    // so we will load it as plain text for now.
                    // A full HTML-to-RTF conversion requires a more specialized library.
                    var para = new Paragraph(new Run(stringReader.ReadToEnd()));
                    doc.Blocks.Add(para);

                    var textRange = new TextRange(doc.ContentStart, doc.ContentEnd);
                    using (var memoryStream = new MemoryStream())
                    {
                        textRange.Save(memoryStream, DataFormats.Rtf);
                        return Encoding.ASCII.GetString(memoryStream.ToArray());
                    }
                }
            }
            return null;
        }
        public string ImportXaml()
        {
            var openFileDialog = new OpenFileDialog
            {
                Filter = "XAML Package (*.xaml)|*.xaml"
            };

            if (openFileDialog.ShowDialog() == true)
            {
                // XAML is a native format, so we can load it directly.
                // We will return it as RTF to be consistent.
                var doc = new FlowDocument();
                var range = new TextRange(doc.ContentStart, doc.ContentEnd);
                using (var fileStream = new FileStream(openFileDialog.FileName, FileMode.Open))
                {
                    range.Load(fileStream, DataFormats.XamlPackage);
                }

                using (var memoryStream = new MemoryStream())
                {
                    range.Save(memoryStream, DataFormats.Rtf);
                    return Encoding.ASCII.GetString(memoryStream.ToArray());
                }
            }
            return null;
        }
    }


}