using iTextSharp.text;
using iTextSharp.text.pdf;
using iTextSharp.tool.xml;
using System.IO;
using System.Reflection.Metadata;
using System.Text;
using Xceed.Words.NET;

namespace StoryTracker.MAUI
{
    public class ExportService
    {
        public void ExportToTxt(string filePath, string plainTextContent)
        {
            File.WriteAllText(filePath, plainTextContent);
        }

        public void ExportToRtf(string filePath, string rtfContent)
        {
            File.WriteAllText(filePath, rtfContent, Encoding.ASCII);
        }

        public void ExportToDocx(string filePath, string xamlContent)
        {
            using (var doc = DocX.Create(filePath))
            {
                using (var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(xamlContent)))
                {
                    doc.InsertDocument(DocX.Load(memoryStream), true);
                }
                doc.Save();
            }
        }

        public void ExportToPdf(string filePath, string xamlContent)
        {
            using (var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(xamlContent)))
            {
                using (var streamReader = new StreamReader(memoryStream))
                {
                    using (var fileStream = new FileStream(filePath, FileMode.Create))
                    {
                        var pdfDocument = new iTextSharp.text.Document(PageSize.A4);
                        var writer = PdfWriter.GetInstance(pdfDocument, fileStream);
                        pdfDocument.Open();
                        XMLWorkerHelper.GetInstance().ParseXHtml(writer, pdfDocument, streamReader);
                        pdfDocument.Close();
                    }
                }
            }
        }
    }
}