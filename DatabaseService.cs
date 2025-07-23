using Npgsql;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace StoryTracker.MAUI
{
    public class DatabaseService
    {
        private readonly string _connectionString;

        public DatabaseService(string connectionString)
        {
            _connectionString = connectionString;
        }

        // --- STORY METHODS ---
        public List<Story> LoadStoryTitles()
        {
            var stories = new List<Story>();
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT StoryID, Title FROM Stories ORDER BY Title";
                using var command = new NpgsqlCommand(sql, connection);
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    stories.Add(new Story { Id = reader.GetInt32(0), Title = reader.GetString(1) });
                }
            }
            catch (Exception ex) { LogError(ex); throw new Exception("Could not load stories. See log.txt."); }
            return stories;
        }

        public Story GetStoryDetails(int storyId)
        {
            var story = new Story();
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT Title, StoryType, Genre, Status FROM Stories WHERE StoryID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", storyId);
                using var reader = command.ExecuteReader();
                if (reader.Read())
                {
                    story.Id = storyId;
                    story.Title = reader.GetString(0);
                    story.StoryType = reader.IsDBNull(1) ? "" : reader.GetString(1);
                    story.Genre = reader.IsDBNull(2) ? "" : reader.GetString(2);
                    story.Status = reader.IsDBNull(3) ? "" : reader.GetString(3);
                }
            }
            catch (Exception ex) { LogError(ex); throw new Exception($"Could not load details for story ID {storyId}. See log.txt."); }
            return story;
        }

        public void SaveStoryDetails(Story storyToSave)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "UPDATE Stories SET Title = @title, StoryType = @storyType, Genre = @genre, Status = @status, LastUpdated = @lastUpdated WHERE StoryID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("title", storyToSave.Title);
                command.Parameters.AddWithValue("storyType", storyToSave.StoryType);
                command.Parameters.AddWithValue("genre", storyToSave.Genre);
                command.Parameters.AddWithValue("status", storyToSave.Status);
                command.Parameters.AddWithValue("lastUpdated", DateTime.UtcNow);
                command.Parameters.AddWithValue("id", storyToSave.Id);
                command.ExecuteNonQuery();
            }
            catch (Exception ex) { LogError(ex); throw new Exception("Could not save story details. See log.txt."); }
        }

        public int CreateStory(string title)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "INSERT INTO Stories (Title, LastUpdated) VALUES (@title, @lastUpdated) RETURNING StoryID";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("title", title);
                command.Parameters.AddWithValue("lastUpdated", DateTime.UtcNow);
                return (int)command.ExecuteScalar();
            }
            catch (Exception ex) { LogError(ex); throw new Exception("Could not create new story. See log.txt."); }
        }

        public void DeleteStory(int storyId)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "DELETE FROM Stories WHERE StoryID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", storyId);
                command.ExecuteNonQuery();
            }
            catch (Exception ex) { LogError(ex); throw new Exception($"Could not delete story ID {storyId}. See log.txt."); }
        }

        // --- CHAPTER METHODS ---
        public List<Chapter> GetChaptersForStory(int storyId)
        {
            var chapters = new List<Chapter>();
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT ChapterID, ChapterNumber, ChapterTitle FROM Chapters WHERE StoryID = @storyId ORDER BY ChapterNumber";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("storyId", storyId);
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    chapters.Add(new Chapter { Id = reader.GetInt32(0), StoryId = storyId, ChapterNumber = reader.GetInt32(1), Title = reader.GetString(2) });
                }
            }
            catch (Exception ex) { LogError(ex); throw new Exception($"Could not load chapters for story ID {storyId}. See log.txt."); }
            return chapters;
        }

        public string GetChapterText(int chapterId)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT ChapterText FROM Chapters WHERE ChapterID = @chapterId";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("chapterId", chapterId);
                var result = command.ExecuteScalar();
                return result is DBNull ? "" : (string)result;
            }
            catch (Exception ex) { LogError(ex); throw new Exception($"Could not load text for chapter ID {chapterId}. See log.txt."); }
        }

        public void SaveChapter(Chapter chapterToSave)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "UPDATE Chapters SET ChapterTitle = @title, ChapterText = @text, WordCount = @wordCount WHERE ChapterID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("title", chapterToSave.Title);
                command.Parameters.AddWithValue("text", chapterToSave.Text);
                command.Parameters.AddWithValue("wordCount", chapterToSave.WordCount);
                command.Parameters.AddWithValue("id", chapterToSave.Id);
                command.ExecuteNonQuery();
            }
            catch (Exception ex) { LogError(ex); throw new Exception("Could not save the chapter. See log.txt."); }
        }

        public void CreateChapter(int storyId, int chapterNumber, string title, string rtfContent)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "INSERT INTO Chapters (StoryID, ChapterNumber, ChapterTitle, ChapterText) VALUES (@storyId, @chapterNumber, @title, @rtfContent)";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("storyId", storyId);
                command.Parameters.AddWithValue("chapterNumber", chapterNumber);
                command.Parameters.AddWithValue("title", title);
                command.Parameters.AddWithValue("rtfContent", rtfContent);
                command.ExecuteNonQuery();
            }
            catch (Exception ex) { LogError(ex); throw new Exception("Could not create new chapter with content. See log.txt."); }
        }

        public void DeleteChapter(int chapterId)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "DELETE FROM Chapters WHERE ChapterID = @id";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("id", chapterId);
                command.ExecuteNonQuery();
            }
            catch (Exception ex) { LogError(ex); throw new Exception($"Could not delete chapter ID {chapterId}. See log.txt."); }
        }

        public int GetTotalWordCountForStory(int storyId)
        {
            try
            {
                using var connection = new NpgsqlConnection(_connectionString);
                connection.Open();
                var sql = "SELECT SUM(WordCount) FROM Chapters WHERE StoryID = @storyId";
                using var command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("storyId", storyId);
                var result = command.ExecuteScalar();
                return result is DBNull ? 0 : Convert.ToInt32(result);
            }
            catch (Exception ex) { LogError(ex); throw new Exception("Could not calculate total word count. See log.txt."); }
        }

        public void CreateStoryFromOutline(string storyTitle, List<string> chapterTitles)
        {
            if (string.IsNullOrWhiteSpace(storyTitle) || !chapterTitles.Any())
            {
                throw new ArgumentException("Story outline must contain a title and at least one chapter.");
            }
            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();
            using var transaction = connection.BeginTransaction();
            try
            {
                var storySql = "INSERT INTO Stories (Title, LastUpdated) VALUES (@title, @lastUpdated) RETURNING StoryID";
                using var storyCommand = new NpgsqlCommand(storySql, connection);
                storyCommand.Parameters.AddWithValue("title", storyTitle);
                storyCommand.Parameters.AddWithValue("lastUpdated", DateTime.UtcNow);
                int storyId = (int)storyCommand.ExecuteScalar();
                int chapterNumber = 1;
                foreach (var chapterTitle in chapterTitles)
                {
                    var chapterSql = "INSERT INTO Chapters (StoryID, ChapterNumber, ChapterTitle, ChapterText) VALUES (@storyId, @chapterNumber, @title, '')";
                    using var chapterCommand = new NpgsqlCommand(chapterSql, connection);
                    chapterCommand.Parameters.AddWithValue("storyId", storyId);
                    chapterCommand.Parameters.AddWithValue("chapterNumber", chapterNumber++);
                    chapterCommand.Parameters.AddWithValue("title", chapterTitle);
                    chapterCommand.ExecuteNonQuery();
                }
                transaction.Commit();
            }
            catch (Exception ex)
            {
                transaction.Rollback();
                LogError(ex);
                throw new Exception("Could not import story outline. See log.txt.");
            }
        }

        private void LogError(Exception ex)
        {
            // Ensure the log directory exists
            string logPath = System.IO.Path.Combine(FileSystem.AppDataDirectory, "log.txt");
            string logMessage = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] - ERROR: {ex.Message}\nSTACK TRACE: {ex.StackTrace}\n\n";
            File.AppendAllText(logPath, logMessage);
        }
    }
}